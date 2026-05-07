package pt.ulisboa.tecnico.reputation.ledger;

import com.daml.ledger.api.v2.CommandSubmissionServiceGrpc;
import com.daml.ledger.api.v2.CommandSubmissionServiceOuterClass;
import com.daml.ledger.javaapi.data.Command;
import com.daml.ledger.javaapi.data.CommandsSubmission;
import com.daml.ledger.javaapi.data.DamlRecord;
import com.daml.ledger.javaapi.data.ExerciseCommand;
import io.grpc.ManagedChannel;
import reputation.interface$.observation.Observation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
public class LedgerSubmitter {

    private static final Logger log = LoggerFactory.getLogger(LedgerSubmitter.class);

    @Value("${canton.operator-party-id}")
    private String operatorPartyId;

    private volatile ManagedChannel channel;

    void setChannel(ManagedChannel channel) {
        this.channel = channel;
    }

    public void submit(List<Command> commands) {
        if (channel == null) {
            log.warn("Cannot submit command — channel not yet initialized");
            return;
        }
        var submission = CommandsSubmission
                .create(operatorPartyId, UUID.randomUUID().toString(), Optional.empty(), commands)
                .withActAs(operatorPartyId);

        CommandSubmissionServiceGrpc.newBlockingStub(channel)
                .submit(CommandSubmissionServiceOuterClass.SubmitRequest.newBuilder()
                        .setCommands(submission.toProto())
                        .build());
    }

    public void markObservationProcessed(String contractId) {
        try {
            var cmd = new ExerciseCommand(Observation.INTERFACE_ID_WITH_PACKAGE_ID, contractId, "MarkProcessed", new DamlRecord(List.of()));
            submit(List.of(cmd));
            log.info("MarkProcessed submitted for contract {}", contractId);
        } catch (Exception e) {
            log.error("Failed to submit MarkProcessed for contract {}: {}", contractId, e.getMessage(), e);
        }
    }
}
