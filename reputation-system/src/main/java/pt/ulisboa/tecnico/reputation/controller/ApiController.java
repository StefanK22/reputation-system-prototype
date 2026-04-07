package pt.ulisboa.tecnico.reputation.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import pt.ulisboa.tecnico.reputation.entity.*;
import pt.ulisboa.tecnico.reputation.service.ReputationService;

import java.util.List;

@RestController
public class ApiController {

    private final ReputationService service;

    public ApiController(ReputationService service) {
        this.service = service;
    }

    @GetMapping("/rankings")
    public List<Subject> getRankings(@RequestParam(defaultValue = "10") int limit) {
        return service.getRanking(limit);
    }

    @GetMapping("/subjects/{party}")
    public Subject getSubject(@PathVariable String party) {
        return service.getSubject(party)
            .orElseThrow(() -> new RuntimeException("Subject not found for party: " + party));
    }

    @GetMapping("/config")
    public ResponseEntity<Configuration> getConfig() {
        return service.getLatestConfig()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
