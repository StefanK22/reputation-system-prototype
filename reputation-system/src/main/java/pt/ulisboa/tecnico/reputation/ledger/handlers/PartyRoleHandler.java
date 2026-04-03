package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.PartyRole;

@Component
public class PartyRoleHandler {

    private static final Logger log = LoggerFactory.getLogger(PartyRoleHandler.class);

    private final ReputationService reputationService;

    public PartyRoleHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    public void handle(CreatedEvent event) {
        try {
            PartyRole.Contract contract = PartyRole.Contract.fromCreatedEvent(event);
            PartyRole data = contract.data;
            log.info("PartyRole created: party={}, roleId={}", data.party, data.roleId);
            reputationService.updateOrCreateNewSubject(data.party, data.roleId);
        } catch (Exception e) {
            log.error("Failed to handle PartyRole event: {}", e.getMessage(), e);
        }
    }
}
