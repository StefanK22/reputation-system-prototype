package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import reputation.configuration.propertypurchase.PropertyPurchaseConfiguration;
import reputation.configuration.role.RoleConfiguration;

@Component
public class ConfigurationHandler {

    private static final Logger log = LoggerFactory.getLogger(ConfigurationHandler.class);

    public void handle(CreatedEvent event) {
        Identifier templateId = event.getTemplateId();

        if (RoleConfiguration.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            RoleConfiguration.Contract contract = RoleConfiguration.Contract.fromCreatedEvent(event);
            log.info("RoleConfiguration created: configId={}, contractId={}",
                    contract.data.configId, contract.id.contractId);
        } else if (PropertyPurchaseConfiguration.TEMPLATE_ID_WITH_PACKAGE_ID.equals(templateId)) {
            log.info("PropertyPurchaseConfiguration created: contractId={}", event.getContractId());
        } else {
            log.warn("Unknown Configuration.I template: {}", templateId);
        }
    }
}
