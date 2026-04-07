package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import pt.ulisboa.tecnico.reputation.entity.Configuration;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.ReputationConfiguration;

import java.util.List;

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

            Configuration.SystemParameters sp = new Configuration.SystemParameters();
            sp.setReputationScoreFloor(data.systemParameters.reputationScoreFloor.doubleValue());
            sp.setReputationScoreCeiling(data.systemParameters.reputationScoreCeiling.doubleValue());
            config.setSystemParameters(sp);

            config.setComponents(data.components.stream().map(c -> {
                Configuration.ComponentDefinition cd = new Configuration.ComponentDefinition();
                cd.setComponentId(c.componentId);
                cd.setDescription(c.description);
                cd.setInitialValue(c.initialValue.doubleValue());
                return cd;
            }).toList());

            config.setRoleWeights(data.roleWeights.stream().map(r -> {
                Configuration.RoleWeights rw = new Configuration.RoleWeights();
                rw.setRoleId(r.roleId);
                rw.setComponentWeights(r.componentWeights.entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        java.util.Map.Entry::getKey,
                        e -> e.getValue().doubleValue()
                    )));
                return rw;
            }).toList());

            config.setInteractionTypes(data.interactionTypes.stream().map(t -> {
                Configuration.InteractionType it = new Configuration.InteractionType();
                it.setInteractionTypeId(t.interactionTypeId);
                it.setDescription(t.description);
                it.setRatingRules(t.ratingRules.stream().map(r -> {
                    Configuration.RatingRule rr = new Configuration.RatingRule();
                    rr.setComponentId(r.componentId);
                    rr.setConditionField(r.conditionField);
                    rr.setConditionComparator(r.conditionComparator);
                    rr.setConditionValue(r.conditionValue.doubleValue());
                    rr.setRatingValue(r.ratingValue.doubleValue());
                    return rr;
                }).toList());
                return it;
            }).toList());

            reputationService.addConfiguration(config);
        } catch (Exception e) {
            log.error("Failed to handle ReputationConfiguration event: {}", e.getMessage(), e);
        }
    }
}
