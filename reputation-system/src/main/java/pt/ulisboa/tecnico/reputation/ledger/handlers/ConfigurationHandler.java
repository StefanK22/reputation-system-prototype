package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.configuration.propertypurchase.PropertyPurchaseConfiguration;
import reputation.configuration.reputationconfiguration.ReputationConfiguration;
import reputation.configuration.role.RoleConfiguration;
import reputation.types.ComponentId;

import java.util.HashMap;
import java.util.Map;

@Component
public class ConfigurationHandler {

    private static final Logger log = LoggerFactory.getLogger(ConfigurationHandler.class);

    private final ReputationService reputationService;

    public ConfigurationHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    public void handle(CreatedEvent event) {
        Identifier templateId = event.getTemplateId();

        if (RoleConfiguration.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            RoleConfiguration.Contract contract = RoleConfiguration.Contract.fromCreatedEvent(event);
            log.info("RoleConfiguration created: configId={}, contractId={}",
                    contract.data.configId, contract.id.contractId);
        } else if (PropertyPurchaseConfiguration.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            log.info("PropertyPurchaseConfiguration created: contractId={}", event.getContractId());
        } else if (ReputationConfiguration.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            handleReputationConfiguration(event);
        } else {
            log.warn("Unknown Configuration.I template: {}", templateId);
        }
    }

    private void handleReputationConfiguration(CreatedEvent event) {
        try {
            ReputationConfiguration.Contract contract = ReputationConfiguration.Contract.fromCreatedEvent(event);
            ReputationConfiguration data = contract.data;

            Map<String, Double> startValues = new HashMap<>();
            data.startValues.forEach((componentId, value) ->
                startValues.put(componentIdName(componentId), value.doubleValue())
            );

            log.info("ReputationConfiguration: configId={}, floor={}, ceiling={}, startValues={}",
                    data.configId, data.scoreFloor, data.scoreCeiling, startValues);

            reputationService.applyReputationConfiguration(
                data.scoreFloor.doubleValue(),
                data.scoreCeiling.doubleValue(),
                startValues
            );
        } catch (Exception e) {
            log.error("Failed to handle ReputationConfiguration: {}", e.getMessage(), e);
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
