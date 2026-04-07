package pt.ulisboa.tecnico.reputation.controller;

import org.springframework.web.bind.annotation.*;

import pt.ulisboa.tecnico.reputation.entity.*;
import pt.ulisboa.tecnico.reputation.service.ReputationService;

import java.util.List;

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

    @GetMapping("/configurations")
    public List<Configuration> getAllConfigurations() {
        return service.getAllConfigurations();
    }
}
