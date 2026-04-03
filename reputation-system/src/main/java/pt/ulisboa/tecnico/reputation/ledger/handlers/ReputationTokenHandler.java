package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import reputation.ReputationToken;

@Component
public class ReputationTokenHandler {

    private static final Logger log = LoggerFactory.getLogger(ReputationTokenHandler.class);

    public void handle(CreatedEvent event) {
        try {
            ReputationToken.Contract contract = ReputationToken.Contract.fromCreatedEvent(event);
            ReputationToken data = contract.data;
            log.info("ReputationToken created: contractId={}", contract.id.contractId);
            // TODO: handle reputation token events if needed
        } catch (Exception e) {
            log.error("Failed to handle ReputationToken event: {}", e.getMessage(), e);
        }
    }
}
