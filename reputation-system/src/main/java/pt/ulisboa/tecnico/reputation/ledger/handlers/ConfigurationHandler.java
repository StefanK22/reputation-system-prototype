package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.Identifier;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.propertypurchase.configuration.PropertyPurchaseConfiguration;
import reputation.role.configuration.RoleConfiguration;

import java.util.LinkedHashMap;

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
            handleRoleConfiguration(event);
        } else if (PropertyPurchaseConfiguration.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            log.info("PropertyPurchaseConfiguration created: contractId={}", event.getContractId());
        } else if (templateId.getEntityName().equals("RentalAgreementConfiguration")) {
            log.info("RentalAgreementConfiguration created: contractId={}", event.getContractId());
        } else {
            log.warn("Unknown Configuration.I template: {}", templateId);
        }
    }

    private void handleRoleConfiguration(CreatedEvent event) {
        try {
            RoleConfiguration.Contract contract = RoleConfiguration.Contract.fromCreatedEvent(event);
            RoleConfiguration data = contract.data;

            double floor      = data.scoreFloor.doubleValue();
            double ceiling    = data.scoreCeiling.doubleValue();
            double startValue = data.startValue.doubleValue();

            LinkedHashMap<String, Double> tiersMap = new LinkedHashMap<>();
            data.tiers.forEach(t -> tiersMap.put(t._1, t._2.doubleValue()));
            String tiersJson = new ObjectMapper().writeValueAsString(tiersMap);

            log.info("RoleConfiguration: configId={}, floor={}, ceiling={}, startValue={}, tiers={}",
                    data.configId, floor, ceiling, startValue, tiersJson);

            reputationService.applyReputationConfiguration(floor, ceiling, startValue, tiersJson);
        } catch (Exception e) {
            log.error("Failed to handle RoleConfiguration: {}", e.getMessage(), e);
        }
    }
}
