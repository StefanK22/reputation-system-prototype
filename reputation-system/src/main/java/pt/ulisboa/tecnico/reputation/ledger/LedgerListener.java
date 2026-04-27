package pt.ulisboa.tecnico.reputation.ledger;

import com.daml.ledger.api.v2.StateServiceGrpc;
import com.daml.ledger.api.v2.StateServiceOuterClass;
import com.daml.ledger.api.v2.UpdateServiceGrpc;
import com.daml.ledger.api.v2.UpdateServiceOuterClass;
import com.daml.ledger.javaapi.data.*;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.stub.StreamObserver;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

@Component
public class LedgerListener {

    private static final Logger log = LoggerFactory.getLogger(LedgerListener.class);

    @Value("${canton.grpc.host}")
    String grpcHost;

    @Value("${canton.grpc.port}")
    int grpcPort;

    @Value("${canton.operator-party-id}")
    String operatorPartyId;

    private ManagedChannel channel;

    public LedgerListener() {
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStart() {
        log.info("Starting LedgerListener - connecting to Canton gRPC at {}:{}", grpcHost, grpcPort);

        channel = ManagedChannelBuilder
                .forAddress(grpcHost, grpcPort)
                .maxInboundMessageSize(10485760)
                .usePlaintext()
                .build();

        startEventStream();
    }

    @PreDestroy
    public void onStop() {
        log.info("Shutting down LedgerListener");
        if (channel != null && !channel.isShutdown()) {
            channel.shutdown();
        }
    }

    private void startEventStream() {
        try {
            StateServiceGrpc.StateServiceBlockingStub stateService = StateServiceGrpc.newBlockingStub(channel);
            long ledgerEnd = stateService
                    .getLedgerEnd(StateServiceOuterClass.GetLedgerEndRequest.newBuilder().build())
                    .getOffset();

            log.info("Ledger end offset: {}. Streaming all contracts from offset 0", ledgerEnd);

            var wildcardFilter = new CumulativeFilter(
                    Map.of(),
                    Map.of(),
                    Optional.of(Filter.Wildcard.HIDE_CREATED_EVENT_BLOB)
            );
            var eventFormat = new EventFormat(
                    Map.<String, Filter>of(operatorPartyId, wildcardFilter),
                    Optional.empty(),
                    false
            );
            var txFormat = new TransactionFormat(eventFormat, TransactionShape.ACS_DELTA);
            var updateFormat = new UpdateFormat(Optional.of(txFormat), Optional.empty(), Optional.empty());

            GetUpdatesRequest request = new GetUpdatesRequest(0L, Optional.empty(), updateFormat);

            UpdateServiceGrpc.UpdateServiceStub updateService = UpdateServiceGrpc.newStub(channel);

            log.info("Starting to stream all contract events from offset 0...");

            updateService.getUpdates(
                    request.toProto(),
                    new StreamObserver<>() {
                        @Override
                        public void onNext(UpdateServiceOuterClass.GetUpdatesResponse response) {
                            try {
                                processUpdate(GetUpdatesResponse.fromProto(response));
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

    private void processUpdate(GetUpdatesResponse response) {
        response.getTransaction().ifPresentOrElse(transaction -> {
            log.info("Transaction at offset {} with {} event(s)", transaction.getOffset(), transaction.getEvents().size());
            for (Event event : transaction.getEvents()) {
                if (event instanceof CreatedEvent createdEvent) {
                    log.info("CreatedEvent templateId={} contractId={}", createdEvent.getTemplateId(), createdEvent.getContractId());
                    dispatch(createdEvent);
                } else if (event instanceof ArchivedEvent archivedEvent) {
                    log.debug("ArchivedEvent templateId={} contractId={}", archivedEvent.getTemplateId(), archivedEvent.getContractId());
                }
            }
        }, () -> log.debug("Non-transaction update received (checkpoint or reassignment), skipping"));
    }

    private void dispatch(CreatedEvent event) {
        Identifier templateId = event.getTemplateId();
        // Handlers will be registered here in Phase 2
        log.warn("No handler registered for template: {}", templateId);
    }
}
