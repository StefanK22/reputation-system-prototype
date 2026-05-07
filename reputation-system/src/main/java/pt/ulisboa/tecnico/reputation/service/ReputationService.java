package pt.ulisboa.tecnico.reputation.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.ulisboa.tecnico.reputation.dto.SubjectDto;
import pt.ulisboa.tecnico.reputation.entity.EngineConfiguration;
import pt.ulisboa.tecnico.reputation.entity.Subject;
import pt.ulisboa.tecnico.reputation.entity.SubjectComponent;
import pt.ulisboa.tecnico.reputation.repository.EngineConfigurationRepository;
import pt.ulisboa.tecnico.reputation.repository.SubjectRepository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ReputationService {

    private static final Logger log = LoggerFactory.getLogger(ReputationService.class);

    private final SubjectRepository subjectRepo;
    private final EngineConfigurationRepository configRepo;

    public ReputationService(SubjectRepository subjectRepo, EngineConfigurationRepository configRepo) {
        this.subjectRepo = subjectRepo;
        this.configRepo = configRepo;
    }

    // ── Engine Configuration ──────────────────────────────────────────────────

    private EngineConfiguration getOrCreateConfig() {
        return configRepo.findById(1L).orElseGet(EngineConfiguration::new);
    }

    @Transactional
    public void applyReputationConfiguration(double floor, double ceiling, Map<String, Double> startValues) {
        EngineConfiguration config = getOrCreateConfig();
        config.setScoreFloor(floor);
        config.setScoreCeiling(ceiling);
        config.getComponentStartValues().clear();
        config.getComponentStartValues().putAll(startValues);
        configRepo.save(config);
        log.info("ReputationConfiguration applied: floor={}, ceiling={}, startValues={}", floor, ceiling, startValues);
    }

    public Map<String, Object> getReputationConfiguration() {
        EngineConfiguration config = getOrCreateConfig();
        return Map.of(
            "configured",           config.isReputationConfigured(),
            "scoreFloor",           config.getScoreFloor()  != null ? config.getScoreFloor()  : 0.0,
            "scoreCeiling",         config.getScoreCeiling() != null ? config.getScoreCeiling() : 1.0,
            "componentStartValues", config.getComponentStartValues()
        );
    }

    public EngineConfiguration getEngineConfiguration() {
        return getOrCreateConfig();
    }

    @Transactional
    public void reset() {
        subjectRepo.deleteAll();
    }

    // ── Role ──────────────────────────────────────────────────────────────────

    @Transactional
    public void upsertRole(String party, String roleType, String contractId, String configContractId,
                           Map<String, Double> componentWeights) {
        Map<String, Double> startValues = getOrCreateConfig().getComponentStartValues();

        Subject s = subjectRepo.findById(party).orElseGet(() -> {
            Subject n = new Subject();
            n.setParty(party);
            n.setOverallScore(0);
            n.setCreatedAt(Instant.now());
            return n;
        });
        s.setRoleType(roleType);
        s.setContractId(contractId);
        s.setConfigContractId(configContractId);
        s.setUpdatedAt(Instant.now());

        componentWeights.forEach((componentId, weight) -> {
            SubjectComponent sc = s.getComponents().stream()
                    .filter(c -> c.getComponentId().equals(componentId))
                    .findFirst()
                    .orElseGet(() -> {
                        SubjectComponent c = new SubjectComponent();
                        c.setComponentId(componentId);
                        c.setScore(startValues.getOrDefault(componentId, 0.0));
                        c.setCount(0);
                        c.setSubject(s);
                        s.getComponents().add(c);
                        return c;
                    });
            sc.setWeight(weight);
        });

        subjectRepo.save(s);
    }

    // ── Observation ───────────────────────────────────────────────────────────

    @Transactional
    public void applyObservation(String party, Map<String, Optional<Double>> componentValues) {
        Subject subject = subjectRepo.findById(party).orElse(null);
        if (subject == null) {
            log.warn("applyObservation: no subject found for party {}", party);
            return;
        }

        Map<String, Double> startValues = getOrCreateConfig().getComponentStartValues();

        componentValues.forEach((componentId, optValue) ->
            optValue.ifPresent(value -> {
                SubjectComponent sc = subject.getComponents().stream()
                        .filter(c -> c.getComponentId().equals(componentId))
                        .findFirst()
                        .orElseGet(() -> {
                            SubjectComponent c = new SubjectComponent();
                            c.setComponentId(componentId);
                            c.setWeight(0.0);
                            c.setScore(startValues.getOrDefault(componentId, 0.0));
                            c.setCount(0);
                            c.setSubject(subject);
                            subject.getComponents().add(c);
                            return c;
                        });

                int count = sc.getCount();
                double step = 1.0 / (count + 2);
                double updated = sc.getScore() + step * (value - sc.getScore());
                sc.setScore(Math.round(updated * 100.0) / 100.0);
                sc.setCount(count + 1);
            })
        );

        recomputeScore(subject);
        subjectRepo.save(subject);
    }

    // ── Score ─────────────────────────────────────────────────────────────────

    private void recomputeScore(Subject subject) {
        double weightedSum = 0.0;
        double totalWeight = 0.0;

        for (SubjectComponent sc : subject.getComponents()) {
            if (sc.getCount() == 0) continue;
            weightedSum += sc.getWeight() * sc.getScore();
            totalWeight += sc.getWeight();
        }

        double raw = totalWeight > 0 ? weightedSum / totalWeight : 0.0;
        double clamped = Math.max(0.0, Math.min(1.0, raw));
        subject.setOverallScore(Math.round(clamped * 10000.0) / 10000.0);
        subject.setUpdatedAt(Instant.now());
    }

    private double scaleValue(double raw, EngineConfiguration config) {
        double floor   = config.getScoreFloor()   != null ? config.getScoreFloor()   : 0.0;
        double ceiling = config.getScoreCeiling() != null ? config.getScoreCeiling() : 1.0;
        return Math.round((floor + raw * (ceiling - floor)) * 10000.0) / 10000.0;
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    public Optional<SubjectDto> getSubject(String party) {
        EngineConfiguration config = getOrCreateConfig();
        return subjectRepo.findById(party).map(s -> toDto(s, config));
    }

    public List<SubjectDto> getRanking(int limit) {
        EngineConfiguration config = getOrCreateConfig();
        return subjectRepo.findAll(
                Sort.by(Sort.Direction.DESC, "overallScore").and(Sort.by(Sort.Direction.ASC, "party"))
        ).stream().limit(limit).map(s -> toDto(s, config)).toList();
    }

    public List<SubjectDto> getAllSubjects() {
        EngineConfiguration config = getOrCreateConfig();
        return subjectRepo.findAll(Sort.by(Sort.Direction.ASC, "party"))
                .stream().map(s -> toDto(s, config)).toList();
    }

    private SubjectDto toDto(Subject s, EngineConfiguration config) {
        var comps = s.getComponents().stream()
                .map(c -> new SubjectDto.ComponentDto(
                        c.getId(), c.getComponentId(), c.getWeight(),
                        scaleValue(c.getScore(), config), c.getCount()))
                .toList();
        return new SubjectDto(
                s.getParty(), s.getRoleType(), s.getContractId(), s.getConfigContractId(),
                scaleValue(s.getOverallScore(), config), s.getCreatedAt(), s.getUpdatedAt(), comps);
    }
}
