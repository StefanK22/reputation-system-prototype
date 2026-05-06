package pt.ulisboa.tecnico.reputation.controller;

import com.daml.ledger.javaapi.data.Identifier;
import org.springframework.web.bind.annotation.*;

import pt.ulisboa.tecnico.reputation.entity.Subject;
import pt.ulisboa.tecnico.reputation.entity.SystemState;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import reputation.interface$.configuration.Configuration;
import reputation.interface$.observation.Observation;
import reputation.interface$.role.Role;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/debug")
public class DebugController {

    private final ReputationService service;

    public DebugController(ReputationService service) {
        this.service = service;
    }

    @GetMapping("/subjects")
    public List<Subject> getAllSubjects() {
        return service.getAllSubjects();
    }

    @GetMapping("/system-state")
    public SystemState getSystemState() {
        return service.getSystemState();
    }

    @GetMapping("/interface-ids")
    public Map<String, String> getInterfaceIds() {
        return Map.of(
            "configuration", formatId(Configuration.INTERFACE_ID_WITH_PACKAGE_ID),
            "role",          formatId(Role.INTERFACE_ID_WITH_PACKAGE_ID),
            "observation",   formatId(Observation.INTERFACE_ID_WITH_PACKAGE_ID)
        );
    }

    private String formatId(Identifier id) {
        return id.getPackageId() + ":" + id.getModuleName() + ":" + id.getEntityName();
    }
}
