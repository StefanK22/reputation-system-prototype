package pt.ulisboa.tecnico.reputation.service;

import com.daml.ledger.javaapi.data.CreatedEvent;
import io.grpc.ManagedChannel;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import pt.ulisboa.tecnico.reputation.entity.EngineConfiguration;
import pt.ulisboa.tecnico.reputation.ledger.LedgerListener;
import pt.ulisboa.tecnico.reputation.ledger.LedgerSubmitter;
import pt.ulisboa.tecnico.reputation.ledger.handlers.ConfigurationHandler;
import pt.ulisboa.tecnico.reputation.ledger.handlers.DisclosureHandler;
import pt.ulisboa.tecnico.reputation.ledger.handlers.ObservationHandler;
import pt.ulisboa.tecnico.reputation.ledger.handlers.RoleHandler;
import pt.ulisboa.tecnico.reputation.repository.EngineConfigurationRepository;
import reputation.interface$.configuration.Configuration;
import reputation.interface$.observation.Observation;
import reputation.interface$.role.Role;

/**
 * Owns the ledger event lifecycle: connects and streams via {@link LedgerListener}, wires the
 * channel into {@link LedgerSubmitter} for outbound commands, and routes each event to the
 * handler responsible for its interface/template.
 */
@Service
public class LedgerService {

    private static final Logger log = LoggerFactory.getLogger(LedgerService.class);

    private final LedgerListener ledgerListener;
    private final LedgerSubmitter ledgerSubmitter;
    private final ConfigurationHandler configurationHandler;
    private final RoleHandler roleHandler;
    private final ObservationHandler observationHandler;
    private final DisclosureHandler disclosureHandler;
    private final EngineConfigurationRepository configRepo;
    private final ReputationService reputationService;

    private ManagedChannel channel;

    public LedgerService(LedgerListener ledgerListener,
                          LedgerSubmitter ledgerSubmitter,
                          ConfigurationHandler configurationHandler,
                          RoleHandler roleHandler,
                          ObservationHandler observationHandler,
                          DisclosureHandler disclosureHandler,
                          EngineConfigurationRepository configRepo,
                          ReputationService reputationService) {
        this.ledgerListener = ledgerListener;
        this.ledgerSubmitter = ledgerSubmitter;
        this.configurationHandler = configurationHandler;
        this.roleHandler = roleHandler;
        this.observationHandler = observationHandler;
        this.disclosureHandler = disclosureHandler;
        this.configRepo = configRepo;
        this.reputationService = reputationService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStart() {
        channel = ledgerListener.connect();
        ledgerSubmitter.setChannel(channel);

        long resumeOffset = configRepo.findById(1L)
                .map(EngineConfiguration::getLedgerOffset)
                .orElse(0L);

        ledgerListener.streamUpdates(channel, resumeOffset, this::dispatch, this::saveOffset);
    }

    @PreDestroy
    public void onStop() {
        ledgerListener.disconnect(channel);
    }

    private void saveOffset(long offset) {
        EngineConfiguration config = reputationService.getOrCreateConfig();
        config.setLedgerOffset(offset);
        configRepo.save(config);
    }

    private void dispatch(CreatedEvent event) {
        var views = event.getInterfaceViews();

        if (views.containsKey(Configuration.INTERFACE_ID_WITH_PACKAGE_ID)) {
            disclosureHandler.trackConfig(event);
            configurationHandler.handle(event);
        } else if (views.containsKey(Role.INTERFACE_ID_WITH_PACKAGE_ID)) {
            roleHandler.handle(event);
        } else if (views.containsKey(Observation.INTERFACE_ID_WITH_PACKAGE_ID)) {
            observationHandler.handle(event);
        } else if ("DisclosureRequest".equals(event.getTemplateId().getEntityName())) {
            disclosureHandler.handle(event);
        } else {
            log.debug("No handler for template: {}", event.getTemplateId());
        }
    }
}
