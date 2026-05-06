package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.interface$.observation.Observation;
import reputation.interface$.observation.View;
import reputation.observation.agent.AgentObservation;
import reputation.observation.buyer.BuyerObservation;
import reputation.types.ComponentId;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Component
public class ObservationHandler {

    private static final Logger log = LoggerFactory.getLogger(ObservationHandler.class);

    private final ReputationService reputationService;

    public ObservationHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    @Transactional
    public void handle(CreatedEvent event) {
        Identifier templateId = event.getTemplateId();

        if (AgentObservation.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            handleAgentObservation(event);
        } else if (BuyerObservation.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            handleBuyerObservation(event);
        } else {
            log.warn("Unknown Observation.I template: {}", templateId);
        }
    }

    private void handleAgentObservation(CreatedEvent event) {
        try {
            var viewRecord = event.getInterfaceViews().get(Observation.INTERFACE_ID_WITH_PACKAGE_ID);
            if (viewRecord == null) {
                log.warn("Observation interface view missing for contractId={}", event.getContractId());
                return;
            }
            View view = View.valueDecoder().decode(viewRecord);
            Map<String, Optional<Double>> componentValues = new HashMap<>();
            view.componentValues.forEach((componentId, optDecimal) ->
                componentValues.put(componentIdName(componentId), optDecimal.map(d -> d.doubleValue()))
            );
            log.info("AgentObservation: subject={}, interactionId={}, components={}",
                    view.subject, view.interactionId, componentValues);
            reputationService.applyObservation(view.subject, componentValues);
        } catch (Exception e) {
            log.error("Failed to handle AgentObservation: {}", e.getMessage(), e);
        }
    }

    private void handleBuyerObservation(CreatedEvent event) {
        try {
            var viewRecord = event.getInterfaceViews().get(Observation.INTERFACE_ID_WITH_PACKAGE_ID);
            if (viewRecord == null) {
                log.warn("Observation interface view missing for contractId={}", event.getContractId());
                return;
            }
            View view = View.valueDecoder().decode(viewRecord);
            Map<String, Optional<Double>> componentValues = new HashMap<>();
            view.componentValues.forEach((componentId, optDecimal) ->
                componentValues.put(componentIdName(componentId), optDecimal.map(d -> d.doubleValue()))
            );
            log.info("BuyerObservation: subject={}, interactionId={}, components={}",
                    view.subject, view.interactionId, componentValues);
            reputationService.applyObservation(view.subject, componentValues);
        } catch (Exception e) {
            log.error("Failed to handle BuyerObservation: {}", e.getMessage(), e);
        }
    }

    private String componentIdName(ComponentId id) {
        return switch (id) {
            case RELIABILITY    -> "Reliability";
            case RESPONSIVENESS -> "Responsiveness";
            case ACCURACY       -> "Accuracy";
        };
    }
}
