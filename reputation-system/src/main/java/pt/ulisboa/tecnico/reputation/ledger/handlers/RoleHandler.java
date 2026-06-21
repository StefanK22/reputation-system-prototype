package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.ulisboa.tecnico.reputation.entity.SubjectComponent;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.interface$.role.Role;
import reputation.interface$.role.View;
import reputation.role.agent.AgentRole;
import reputation.role.buyer.BuyerRole;
import reputation.role.landlord.LandlordRole;
import reputation.role.tenant.TenantRole;
import reputation.types.ComponentId;

import java.util.ArrayList;
import java.util.List;

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

            List<SubjectComponent> components = new ArrayList<>();
            view.roleComponents.forEach((componentId, roleComponent) -> {
                SubjectComponent comp = new SubjectComponent();
                comp.setComponentId(componentIdName(componentId));
                comp.setWeight(roleComponent.weight.doubleValue());
                comp.setScore(roleComponent.score.doubleValue());
                comp.setCount(roleComponent.count.intValue());
                components.add(comp);
            });

            log.info("Role created: party={}, type={}, weights={}", view.party, roleType, components);

            reputationService.upsertRole(view.party, roleType, contractId, configContractId, components);
        } catch (Exception e) {
            log.error("Failed to handle Role event: {}", e.getMessage(), e);
        }
    }

    private String resolveConfigContractId(CreatedEvent event) {
        if (AgentRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(event.getTemplateId())) {
            return AgentRole.Contract.fromCreatedEvent(event).data.configCid.contractId;
        } else if (BuyerRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(event.getTemplateId())) {
            return BuyerRole.Contract.fromCreatedEvent(event).data.configCid.contractId;
        } else if (LandlordRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(event.getTemplateId())) {
            return LandlordRole.Contract.fromCreatedEvent(event).data.configCid.contractId;
        } else if (TenantRole.TEMPLATE_ID_WITH_PACKAGE_ID.equals(event.getTemplateId())) {
            return TenantRole.Contract.fromCreatedEvent(event).data.configCid.contractId;
        }
        return null;
    }

    private String resolveRoleType(Identifier templateId) {
        return switch (templateId.getEntityName()) {
            case "AgentRole"    -> "Agent";
            case "BuyerRole"    -> "Buyer";
            case "LandlordRole" -> "Landlord";
            case "TenantRole"   -> "Tenant";
            default             -> "Unknown";
        };
    }

    static String componentIdName(ComponentId id) {
        return switch (id) {
            case RELIABILITY    -> "Reliability";
            case RESPONSIVENESS -> "Responsiveness";
            case ACCURACY       -> "Accuracy";
        };
    }
}
