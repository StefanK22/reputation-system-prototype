package pt.ulisboa.tecnico.reputation.controller;

import org.springframework.web.bind.annotation.*;

import pt.ulisboa.tecnico.reputation.dto.SubjectDto;
import pt.ulisboa.tecnico.reputation.service.ReputationService;

import java.util.List;

@RestController
public class ApiController {

    private final ReputationService service;

    public ApiController(ReputationService service) {
        this.service = service;
    }

    @GetMapping("/rankings")
    public List<SubjectDto> getRankings(@RequestParam(defaultValue = "10") int limit) {
        return service.getRanking(limit);
    }

    @GetMapping("/subjects/{party}")
    public SubjectDto getSubject(@PathVariable String party) {
        return service.getSubject(party)
            .orElseThrow(() -> new RuntimeException("Subject not found for party: " + party));
    }
}
