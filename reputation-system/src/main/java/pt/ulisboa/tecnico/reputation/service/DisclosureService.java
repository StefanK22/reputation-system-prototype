package pt.ulisboa.tecnico.reputation.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DisclosureService {

    private static final Logger log = LoggerFactory.getLogger(DisclosureService.class);

    private final Map<String, String> configContractIds = new ConcurrentHashMap<>();

    public void trackConfig(String templateName, String contractId) {
        configContractIds.put(templateName, contractId);
        log.debug("Tracked config contract: {} → {}", templateName, contractId);
    }

    public String resolveConfigContractId(String templateName) {
        return configContractIds.get(templateName);
    }

    public boolean shouldApprove(String configType) {
        return true;
    }
}
