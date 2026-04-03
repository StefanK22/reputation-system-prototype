package pt.ulisboa.tecnico.reputation.ledger.handlers;

import com.daml.ledger.javaapi.data.CreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import reputation.Feedback;

import java.lang.reflect.Method;

@Component
public class FeedbackHandler {

    private static final Logger log = LoggerFactory.getLogger(FeedbackHandler.class);
    private static final String FEEDBACK_ENTITY_CLASS = "pt.ulisboa.tecnico.reputation.entity.Feedback";
    private static final String FEEDBACK_REPOSITORY_CLASS = "pt.ulisboa.tecnico.reputation.repository.FeedbackRepository";

    private final ApplicationContext applicationContext;

    private volatile boolean persistenceResolved;
    private volatile boolean persistenceAvailable;
    private Object feedbackRepository;
    private Method saveMethod;
    private Class<?> feedbackEntityType;
    private Method setFromMethod;
    private Method setToMethod;
    private Method setInteractionIdMethod;
    private Method setContractIdMethod;

    public FeedbackHandler(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    public void handle(CreatedEvent event) {
        try {
            Feedback.Contract contract = Feedback.Contract.fromCreatedEvent(event);
            Feedback data = contract.data;
            log.info("Feedback created: from={}, to={}, interactionId={}", data.from, data.to, data.interactionId);
            persistFeedback(data, contract.id.contractId);
        } catch (Exception e) {
            log.error("Failed to handle Feedback event: {}", e.getMessage(), e);
        }
    }

    private void persistFeedback(Feedback data, String contractId) throws Exception {
        resolvePersistence();
        if (!persistenceAvailable) {
            return;
        }

        Object entity = feedbackEntityType.getDeclaredConstructor().newInstance();
        if (setFromMethod != null) {
            setFromMethod.invoke(entity, data.from);
        }
        if (setToMethod != null) {
            setToMethod.invoke(entity, data.to);
        }
        if (setInteractionIdMethod != null) {
            setInteractionIdMethod.invoke(entity, data.interactionId);
        }
        if (setContractIdMethod != null) {
            setContractIdMethod.invoke(entity, contractId);
        }
        saveMethod.invoke(feedbackRepository, entity);
    }

    private synchronized void resolvePersistence() {
        if (persistenceResolved) {
            return;
        }
        persistenceResolved = true;
        try {
            feedbackEntityType = Class.forName(FEEDBACK_ENTITY_CLASS);
            Class<?> repositoryType = Class.forName(FEEDBACK_REPOSITORY_CLASS);
            feedbackRepository = applicationContext.getBean(repositoryType);
            saveMethod = repositoryType.getMethod("save", Object.class);
            setFromMethod = findMethod(feedbackEntityType, "setFrom");
            setToMethod = findMethod(feedbackEntityType, "setTo");
            setInteractionIdMethod = findMethod(feedbackEntityType, "setInteractionId");
            setContractIdMethod = findMethod(feedbackEntityType, "setContractId");
            persistenceAvailable = true;
        } catch (Exception ignored) {
            persistenceAvailable = false;
        }
    }

    private Method findMethod(Class<?> type, String name) {
        try {
            return type.getMethod(name, String.class);
        } catch (NoSuchMethodException e) {
            return null;
        }
    }
}
