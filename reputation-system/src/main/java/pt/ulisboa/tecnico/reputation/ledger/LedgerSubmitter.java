package pt.ulisboa.tecnico.reputation.ledger;

import com.daml.ledger.api.v2.CommandServiceGrpc;
import com.daml.ledger.api.v2.CommandServiceOuterClass;
import com.daml.ledger.api.v2.CommandSubmissionServiceGrpc;
import com.daml.ledger.api.v2.CommandSubmissionServiceOuterClass;
import com.daml.ledger.api.v2.EventOuterClass;
import com.daml.ledger.javaapi.data.*;
import io.grpc.ManagedChannel;
import reputation.interface$.observation.Observation;
import reputation.interface$.role.Role;
import reputation.types.ComponentId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Component
public class LedgerSubmitter {

    private static final Logger log = LoggerFactory.getLogger(LedgerSubmitter.class);

    @Value("${canton.operator-party-id}")
    private String operatorPartyId;

    private volatile ManagedChannel channel;

    public void setChannel(ManagedChannel channel) {
        this.channel = channel;
    }

    public void submit(List<Command> commands) {
        if (channel == null) {
            log.warn("Cannot submit command — channel not yet initialized");
            return;
        }
        var submission = buildSubmission(commands);
        CommandSubmissionServiceGrpc.newBlockingStub(channel)
                .submit(CommandSubmissionServiceOuterClass.SubmitRequest.newBuilder()
                        .setCommands(submission.toProto())
                        .build());
    }

    /**
     * Submits commands synchronously and returns the contractId of the first created contract.
     * Use this for exercises that archive a contract and return a new one (e.g. MarkProcessed, UpdateScore).
     */
    public String submitAndWaitForCreatedContractId(List<Command> commands) {
        if (channel == null) {
            throw new IllegalStateException("Cannot submit command — channel not yet initialized");
        }
        var submission = buildSubmission(commands);

        var eventFormat = new EventFormat(
                Map.of(operatorPartyId, new CumulativeFilter(
                        Map.of(), Map.of(), Optional.of(Filter.Wildcard.HIDE_CREATED_EVENT_BLOB)
                )),
                Optional.empty(),
                false
        );
        var txFormat = new TransactionFormat(eventFormat, TransactionShape.ACS_DELTA);

        var response = CommandServiceGrpc.newBlockingStub(channel)
                .submitAndWaitForTransaction(
                        CommandServiceOuterClass.SubmitAndWaitForTransactionRequest.newBuilder()
                                .setCommands(submission.toProto())
                                .setTransactionFormat(txFormat.toProto())
                                .build()
                );

        return response.getTransaction().getEventsList().stream()
                .filter(EventOuterClass.Event::hasCreated)
                .map(e -> e.getCreated().getContractId())
                .findFirst()
                .orElseThrow(() -> new RuntimeException("No created event in transaction response"));
    }

    public String markObservationProcessed(String contractId) {
        try {
            var cmd = new ExerciseCommand(Observation.INTERFACE_ID_WITH_PACKAGE_ID, contractId, "MarkProcessed", new DamlRecord(List.of()));
            String newContractId = submitAndWaitForCreatedContractId(List.of(cmd));
            log.info("MarkProcessed: {} → new contractId {}", contractId, newContractId);
            return newContractId;
        } catch (Exception e) {
            log.error("Failed to submit MarkProcessed for contract {}: {}", contractId, e.getMessage(), e);
            return null;
        }
    }

    public String submitUpdateScore(String roleContractId, Map<String, Double> scores, String observationCid) {
        try {
            var scoresValue = scores.entrySet().stream()
                    .collect(DamlCollectors.toDamlGenMap(
                            e -> nameToComponentId(e.getKey()).toValue(),
                            e -> new Numeric(BigDecimal.valueOf(e.getValue()))
                    ));
            var arg = new DamlRecord(List.of(
                    new DamlRecord.Field("newUpdatedScores", scoresValue),
                    new DamlRecord.Field("observationCid", new ContractId(observationCid)),
                    new DamlRecord.Field("updatedAt", Timestamp.fromInstant(Instant.now()))
            ));
            var cmd = new ExerciseCommand(Role.INTERFACE_ID_WITH_PACKAGE_ID, roleContractId, "UpdateScore", arg);
            String newContractId = submitAndWaitForCreatedContractId(List.of(cmd));
            log.info("UpdateScore: {} → new contractId {}", roleContractId, newContractId);
            return newContractId;
        } catch (Exception e) {
            log.error("Failed to submit UpdateScore for roleContract {}: {}", roleContractId, e.getMessage(), e);
            return null;
        }
    }

    public void completeDisclosureRequest(Identifier templateId, String requestContractId, String configCid) {
        try {
            var arg = new DamlRecord(List.of(
                    new DamlRecord.Field("configCid", new ContractId(configCid))
            ));
            var cmd = new ExerciseCommand(templateId, requestContractId, "Complete", arg);
            submit(List.of(cmd));
            log.info("Complete submitted for DisclosureRequest {}", requestContractId);
        } catch (Exception e) {
            log.error("Failed to submit Complete for DisclosureRequest {}: {}", requestContractId, e.getMessage(), e);
        }
    }

    private static ComponentId nameToComponentId(String name) {
        return switch (name) {
            case "Reliability"    -> ComponentId.RELIABILITY;
            case "Responsiveness" -> ComponentId.RESPONSIVENESS;
            case "Accuracy"       -> ComponentId.ACCURACY;
            default -> throw new IllegalArgumentException("Unknown component: " + name);
        };
    }

    private CommandsSubmission buildSubmission(List<Command> commands) {
        return CommandsSubmission
                .create(operatorPartyId, UUID.randomUUID().toString(), Optional.empty(), commands)
                .withActAs(operatorPartyId);
    }
}
