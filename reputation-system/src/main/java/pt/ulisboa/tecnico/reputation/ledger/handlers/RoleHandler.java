package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.interface$.role.Role;
import reputation.interface$.role.View;
import reputation.role.agent.AgentRole;
import reputation.role.buyer.BuyerRole;
import reputation.types.ComponentId;

import java.util.HashMap;
import java.util.Map;

@Component
public class RoleHandler {

    private static final Logger log = LoggerFactory.getLogger(RoleHandler.class);

    private final ReputationService reputationService;

    public RoleHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    public void handle(CreatedEvent event) {
        try {
            String roleType = resolveRoleType(event.getTemplateId());
            String contractId = event.getContractId();
            String configContractId = resolveConfigContractId(event);

            var viewRecord = event.getInterfaceViews().get(Role.INTERFACE_ID_WITH_PACKAGE_ID);
            if (viewRecord == null) {
                log.warn("Role interface view not present for templateId={}", event.getTemplateId());
                return;
            }

            View view = View.valueDecoder().decode(viewRecord);

            Map<String, Double> componentWeights = new HashMap<>();
            view.componentWeights.forEach((componentId, weight) ->
                componentWeights.put(componentIdName(componentId), weight.doubleValue())
            );

            log.info("Role created: party={}, type={}, weights={}", view.party, roleType, componentWeights);

            reputationService.upsertRole(view.party, roleType, contractId, configContractId, componentWeights);
        } catch (Exception e) {
            log.error("Failed to handle Role event: {}", e.getMessage(), e);
        }
    }

    private String resolveConfigContractId(CreatedEvent event) {
        if (AgentRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(event.getTemplateId())) {
            return AgentRole.Contract.fromCreatedEvent(event).data.configCid.contractId;
        } else if (BuyerRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(event.getTemplateId())) {
            return BuyerRole.Contract.fromCreatedEvent(event).data.configCid.contractId;
        }
        return null;
    }

    private String resolveRoleType(Identifier templateId) {
        if (AgentRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) return "Agent";
        if (BuyerRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId))  return "Buyer";
        return "Unknown";
    }

    private String componentIdName(ComponentId id) {
        return switch (id) {
            case RELIABILITY    -> "Reliability";
            case RESPONSIVENESS -> "Responsiveness";
            case ACCURACY       -> "Accuracy";
        };
    }
}
