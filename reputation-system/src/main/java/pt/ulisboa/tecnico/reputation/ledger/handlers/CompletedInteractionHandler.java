package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import pt.ulisboa.tecnico.reputation.entity.Subject;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.CompletedInteraction;

import java.math.BigDecimal;
import java.util.Map;

@Component
public class CompletedInteractionHandler {

    private static final Logger log = LoggerFactory.getLogger(CompletedInteractionHandler.class);

    private final ReputationService reputationService;

    public CompletedInteractionHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    @Transactional
    public void handle(CreatedEvent event) {
        try {
            CompletedInteraction.Contract contract = CompletedInteraction.Contract.fromCreatedEvent(event);
            CompletedInteraction data = contract.data;
            log.info("CompletedInteraction created: interactionId={}, type={}, participants={}",
                    data.interactionId, data.interactionType, data.participants);

            for (String party : data.participants) {
                String role = reputationService.getRole(party);
                Subject subject = reputationService.getOrCreateSubject(party, role);
                applyOutcome(subject, data.outcome);
                reputationService.recomputeScore(subject);
                reputationService.updateSubject(subject);
            }
        } catch (Exception e) {
            log.error("Failed to handle CompletedInteraction event: {}", e.getMessage(), e);
        }
    }

    private void applyOutcome(Subject subject, Map<String, BigDecimal> outcome) {
        for (Map.Entry<String, BigDecimal> entry : outcome.entrySet()) {
            String componentId = entry.getKey();
            double newValue = entry.getValue().doubleValue();

            pt.ulisboa.tecnico.reputation.entity.Component component = subject.getComponents().stream()
                    .filter(c -> c.getComponentId().equals(componentId))
                    .findFirst()
                    .orElseGet(() -> {
                        var c = new pt.ulisboa.tecnico.reputation.entity.Component();
                        c.setComponentId(componentId);
                        c.setDescription(componentId);
                        c.setValue(0);
                        c.setInteractionCount(0);
                        c.setSubject(subject);
                        subject.getComponents().add(c);
                        return c;
                    });

            int count = component.getInteractionCount();
            double updated = (component.getValue() * count + newValue) / (count + 1);
            component.setValue(Math.round(updated * 100.0) / 100.0);
            component.setInteractionCount(count + 1);
        }
    }
}
