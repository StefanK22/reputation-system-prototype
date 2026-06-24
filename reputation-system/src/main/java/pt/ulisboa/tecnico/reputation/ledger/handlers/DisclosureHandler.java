package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import com.daml.ledger.javaapi.data.DamlEnum;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.ulisboa.tecnico.reputation.service.DisclosureService;
import pt.ulisboa.tecnico.reputation.service.LedgerService;

@Component
public class DisclosureHandler {

    private static final Logger log = LoggerFactory.getLogger(DisclosureHandler.class);

    private final DisclosureService disclosureService;
    private LedgerService ledgerService;

    public DisclosureHandler(DisclosureService disclosureService) {
        this.disclosureService = disclosureService;
    }

    public void setLedgerService(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    // Called for every Configuration.I contract so DisclosureService can look it up when a request arrives.
    public void trackConfig(CreatedEvent event) {
        disclosureService.trackConfig(event.getTemplateId().getEntityName(), event.getContractId());
    }

    public void handle(CreatedEvent event) {
        try {
            // Fields in order: requester(0), operator(1), configType(2), requestedAt(3)
            DamlEnum configType = (DamlEnum) event.getArguments().getFields().get(2).getValue();
            String configTypeName = configType.getConstructor();

            if (!disclosureService.shouldApprove(configTypeName)) {
                log.info("DisclosureRequest {} rejected by policy (configType={})", event.getContractId(), configTypeName);
                return;
            }

            String templateName = switch (configTypeName) {
                case "RoleConfig"             -> "RoleConfiguration";
                case "PropertyPurchaseConfig" -> "PropertyPurchaseConfiguration";
                case "RentalAgreementConfig"  -> "RentalAgreementConfiguration";
                default -> throw new IllegalArgumentException("Unknown configType: " + configTypeName);
            };

            String configCid = disclosureService.resolveConfigContractId(templateName);
            if (configCid == null) {
                log.warn("No active config contract for type '{}', cannot complete DisclosureRequest {}",
                        templateName, event.getContractId());
                return;
            }

            log.info("Completing DisclosureRequest [{}] configType={}", event.getContractId(), configTypeName);
            ledgerService.completeDisclosureRequest(event.getTemplateId(), event.getContractId(), configCid);
        } catch (Exception e) {
            log.error("Failed to handle DisclosureRequest {}: {}", event.getContractId(), e.getMessage(), e);
        }
    }
}
