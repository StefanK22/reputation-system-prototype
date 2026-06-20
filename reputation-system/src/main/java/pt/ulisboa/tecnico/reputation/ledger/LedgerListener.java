package pt.ulisboa.tecnico.reputation.ledger;

import com.daml.ledger.api.v2.UpdateServiceGrpc;
import com.daml.ledger.api.v2.UpdateServiceOuterClass;
import com.daml.ledger.javaapi.data.*;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import reputation.interface$.configuration.Configuration;
import reputation.interface$.observation.Observation;
import reputation.interface$.role.Role;

import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.LongConsumer;

/** Low-level gRPC transport: connects to the Canton participant and streams raw ledger events. */
@Component
public class LedgerListener {

    private static final Logger log = LoggerFactory.getLogger(LedgerListener.class);

    @Value("${canton.grpc.host}")
    String grpcHost;

    @Value("${canton.grpc.port}")
    int grpcPort;

    @Value("${canton.operator-party-id}")
    String operatorPartyId;

    public ManagedChannel connect() {
        log.info("Connecting to Canton gRPC at {}:{}", grpcHost, grpcPort);
        return ManagedChannelBuilder
                .forAddress(grpcHost, grpcPort)
                .maxInboundMessageSize(10485760)
                .usePlaintext()
                .build();
    }

    public void disconnect(ManagedChannel channel) {
        log.info("Shutting down LedgerListener");
        if (channel != null && !channel.isShutdown()) {
            channel.shutdown();
        }
    }

    public void streamUpdates(ManagedChannel channel, long resumeOffset,
                               Consumer<CreatedEvent> onCreatedEvent, LongConsumer onOffsetAdvance) {
        try {
            log.info("Resuming ledger stream from offset {}", resumeOffset);

            var interfaceFilters = Map.of(
                    Configuration.INTERFACE_ID_WITH_PACKAGE_ID, Filter.Interface.INCLUDE_VIEW_HIDE_CREATED_EVENT_BLOB,
                    Role.INTERFACE_ID_WITH_PACKAGE_ID,           Filter.Interface.INCLUDE_VIEW_HIDE_CREATED_EVENT_BLOB,
                    Observation.INTERFACE_ID_WITH_PACKAGE_ID,    Filter.Interface.INCLUDE_VIEW_HIDE_CREATED_EVENT_BLOB
            );
            var cumulativeFilter = new CumulativeFilter(
                    interfaceFilters,
                    Map.of(),
                    Optional.of(Filter.Wildcard.HIDE_CREATED_EVENT_BLOB)
            );
            var eventFormat = new EventFormat(
                    Map.<String, Filter>of(operatorPartyId, cumulativeFilter),
                    Optional.empty(),
                    false
            );
            var txFormat = new TransactionFormat(eventFormat, TransactionShape.ACS_DELTA);
            var updateFormat = new UpdateFormat(Optional.of(txFormat), Optional.empty(), Optional.empty());

            GetUpdatesRequest request = new GetUpdatesRequest(resumeOffset, Optional.empty(), updateFormat);

            UpdateServiceGrpc.UpdateServiceStub updateService = UpdateServiceGrpc.newStub(channel);

            log.info("Starting to stream all contract events from offset 0...");

            updateService.getUpdates(
                    request.toProto(),
                    new StreamObserver<>() {
                        @Override
                        public void onNext(UpdateServiceOuterClass.GetUpdatesResponse response) {
                            try {
                                processResponse(GetUpdatesResponse.fromProto(response), onCreatedEvent, onOffsetAdvance);
                            } catch (Exception e) {
                                log.error("Error processing update: {}", e.getMessage(), e);
                            }
                        }

                        @Override
                        public void onError(Throwable throwable) {
                            log.error("ERROR in event stream: {}", throwable.getMessage(), throwable);
                        }

                        @Override
                        public void onCompleted() {
                            log.info("Event stream completed");
                        }
                    }
            );

            log.info("Event stream started successfully");

        } catch (Exception e) {
            log.error("Failed to start event stream: {}", e.getMessage(), e);
        }
    }

    private void processResponse(GetUpdatesResponse response, Consumer<CreatedEvent> onCreatedEvent,
                                  LongConsumer onOffsetAdvance) {
        response.getTransaction().ifPresentOrElse(transaction -> {
            for (Event event : transaction.getEvents()) {
                if (event instanceof CreatedEvent createdEvent) {
                    log.info("+ {} [{}]", shortTemplate(createdEvent.getTemplateId()), shortId(createdEvent.getContractId()));
                    onCreatedEvent.accept(createdEvent);
                } else if (event instanceof ArchivedEvent archivedEvent) {
                    log.info("- {} [{}]", shortTemplate(archivedEvent.getTemplateId()), shortId(archivedEvent.getContractId()));
                }
            }
            onOffsetAdvance.accept(transaction.getOffset());
        }, () -> {});
    }

    private static String shortTemplate(Identifier id) {
        return id.getEntityName();
    }

    private static String shortId(String contractId) {
        return contractId.length() > 8 ? contractId.substring(0, 8) + "…" : contractId;
    }
}
