package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import pt.ulisboa.tecnico.reputation.service.ReputationService;
import pt.ulisboa.tecnico.reputation.service.LedgerService;
import reputation.interface$.observation.Observation;
import reputation.interface$.observation.View;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Component
public class ObservationHandler {

    private static final Logger log = LoggerFactory.getLogger(ObservationHandler.class);

    private final ReputationService reputationService;
    private LedgerService ledgerService;

    public ObservationHandler(ReputationService reputationService) {
        this.reputationService = reputationService;
    }

    public void setLedgerService(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    @Transactional
    public void handle(CreatedEvent event) {
        try {
            var viewRecord = event.getInterfaceViews().get(Observation.INTERFACE_ID_WITH_PACKAGE_ID);
            if (viewRecord == null) {
                log.warn("Observation interface view missing for contractId={}", event.getContractId());
                return;
            }
            View view = View.valueDecoder().decode(viewRecord);

            if (view.processed) {
                log.debug("Skipping already-processed Observation: {}", event.getContractId());
                return;
            }

            Map<String, Optional<Double>> componentValues = new HashMap<>();
            view.componentValues.forEach((componentId, optDecimal) ->
                componentValues.put(RoleHandler.componentIdName(componentId), optDecimal.map(d -> d.doubleValue()))
            );
            log.info("Observation: subject={}, interactionId={}, components={}",
                    view.subject, view.interactionId, componentValues);

            reputationService.applyObservation(view.subject, componentValues);

            String newObsCid = ledgerService.markObservationProcessed(event.getContractId());
            if (newObsCid == null) {
                log.warn("MarkProcessed failed for {}; skipping UpdateScore", event.getContractId());
                return;
            }

            var subjectOpt = reputationService.getSubject(view.subject);
            if (subjectOpt.isEmpty() || subjectOpt.get().contractId() == null) {
                log.warn("No role contractId for party {}; skipping UpdateScore", view.subject);
                return;
            }

            String newRoleContractId = ledgerService.submitUpdateScore(
                    subjectOpt.get().contractId(),
                    reputationService.getSubjectInternalScores(view.subject),
                    newObsCid
            );
            if (newRoleContractId != null) {
                reputationService.updateRoleContractId(view.subject, newRoleContractId);
            }
        } catch (Exception e) {
            log.error("Failed to handle Observation: {}", e.getMessage(), e);
        }
    }

}
