package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import pt.ulisboa.tecnico.reputation.entity.Configuration;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.ReputationConfiguration;

@Component
public class ReputationConfigurationHandler {

    private static final Logger log = LoggerFactory.getLogger(ReputationConfigurationHandler.class);

    private final ReputationService reputationService;

    public ReputationConfigurationHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    public void handle(CreatedEvent event) {
        try {
            ReputationConfiguration.Contract contract = ReputationConfiguration.Contract.fromCreatedEvent(event);
            ReputationConfiguration data = contract.data;
            log.info("ReputationConfiguration created: configId={}, version={}", data.configId, data.version);

            Configuration config = new Configuration();
            config.setConfigId(data.configId);
            config.setVersion(data.version.intValue());
            config.setActivationTime(data.activatedAt);
            config.setContractId(contract.id.contractId);

            reputationService.addConfiguration(config);
        } catch (Exception e) {
            log.error("Failed to handle ReputationConfiguration event: {}", e.getMessage(), e);
        }
    }
}
