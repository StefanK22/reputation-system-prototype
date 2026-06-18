package pt.ulisboa.tecnico.reputation.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import pt.ulisboa.tecnico.reputation.dto.SubjectDto;
import pt.ulisboa.tecnico.reputation.dto.VcStatus;
import pt.ulisboa.tecnico.reputation.service.ReputationService;

import java.util.List;
import java.util.Map;

@RestController
public class ApiController {

    private final ReputationService service;

    public ApiController(ReputationService service) {
        this.service = service;
    }

    @GetMapping("/rankings")
    public List<SubjectDto> getRankings() {
        return service.getRanking();
    }

    // should replace the runtime exception with a error message response.
    @GetMapping("/subjects/{party}")
    public SubjectDto getSubject(@PathVariable String party) {
        return service.getSubject(party)
            .orElseThrow(() -> new RuntimeException("Subject not found for party: " + party));
    }

    @GetMapping("/tiers")
    public Map<String, Double> getTiers() {
        return service.getDisplayTiers();
    }

    @GetMapping("/vc/issue/{party}")
    public ResponseEntity<String> issueVc(@PathVariable String party) {
        return service.issueMockVc(party)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.badRequest().body("No qualifying tier for party: " + party));
    }

    @GetMapping("/vc/verify")
    public VcStatus verifyVc(@RequestParam String party,
                              @RequestParam String tier,
                              @RequestParam String issuanceDate,
                              @RequestParam String jws) {
        return service.verifyMockVc(party, tier, issuanceDate, jws);
    }
}
