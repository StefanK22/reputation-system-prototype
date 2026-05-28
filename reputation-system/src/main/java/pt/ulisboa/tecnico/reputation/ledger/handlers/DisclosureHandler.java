package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.DamlEnum;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.ulisboa.tecnico.reputation.ledger.LedgerSubmitter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class DisclosureHandler {

    private static final Logger log = LoggerFactory.getLogger(DisclosureHandler.class);

    private final LedgerSubmitter ledgerSubmitter;
    private final Map<String, String> configContractIds = new ConcurrentHashMap<>();

    public DisclosureHandler(LedgerSubmitter ledgerSubmitter) {
        this.ledgerSubmitter = ledgerSubmitter;
    }

    // Called for every Configuration.I contract so we can look it up when a request arrives.
    public void trackConfig(CreatedEvent event) {
        configContractIds.put(event.getTemplateId().getEntityName(), event.getContractId());
        log.debug("Tracked config contract: {} → {}", event.getTemplateId().getEntityName(), event.getContractId());
    }

    public void handle(CreatedEvent event) {
        try {
            // Fields in order: requester(0), operator(1), configType(2), requestedAt(3)
            DamlEnum configType = (DamlEnum) event.getArguments().getFields().get(2).getValue();

            String templateName = switch (configType.getConstructor()) {
                case "RoleConfig"             -> "RoleConfiguration";
                case "PropertyPurchaseConfig" -> "PropertyPurchaseConfiguration";
                case "RentalAgreementConfig"  -> "RentalAgreementConfiguration";
                default -> throw new IllegalArgumentException("Unknown configType: " + configType.getConstructor());
            };

            String configCid = configContractIds.get(templateName);
            if (configCid == null) {
                log.warn("No active config contract for type '{}', cannot complete DisclosureRequest {}",
                        templateName, event.getContractId());
                return;
            }

            log.info("Completing DisclosureRequest [{}] configType={}", event.getContractId(), configType.getConstructor());
            ledgerSubmitter.completeDisclosureRequest(event.getTemplateId(), event.getContractId(), configCid);
        } catch (Exception e) {
            log.error("Failed to handle DisclosureRequest {}: {}", event.getContractId(), e.getMessage(), e);
        }
    }
}
