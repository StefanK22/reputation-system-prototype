package pt.ulisboa.tecnico.reputation.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import pt.ulisboa.tecnico.reputation.dto.SubjectDto;
import pt.ulisboa.tecnico.reputation.dto.VcStatus;
import pt.ulisboa.tecnico.reputation.service.ReputationService;
import pt.ulisboa.tecnico.reputation.service.VcService;

import java.util.List;
import java.util.Map;

@RestController
public class ApiController {

    private final ReputationService service;
    private final VcService vcService;

    public ApiController(ReputationService service, VcService vcService) {
        this.service = service;
        this.vcService = vcService;
    }

    @GetMapping("/rankings")
    public List<SubjectDto> getRankings() {
        return service.getRanking();
    }

    @GetMapping("/subjects/{party}")
    public ResponseEntity<SubjectDto> getSubject(@PathVariable String party) {
        return service.getSubject(party)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/tiers")
    public Map<String, Double> getTiers() {
        return service.getDisplayTiers();
    }

    @GetMapping("/vc/issue/{party}")
    public ResponseEntity<String> issueVc(@PathVariable String party) {
        return vcService.issueMockVc(party)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.badRequest().body("No qualifying tier for party: " + party));
    }

    @GetMapping("/vc/verify")
    public VcStatus verifyVc(@RequestParam String party,
                              @RequestParam String tier,
                              @RequestParam String issuanceDate,
                              @RequestParam String jws) {
        return vcService.verifyMockVc(party, tier, issuanceDate, jws);
    }
}
