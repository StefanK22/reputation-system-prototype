package pt.ulisboa.tecnico.reputation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.Base64;
import java.util.LinkedHashMap;
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

    @Transactional
    public EngineConfiguration getOrCreateConfig() {
        return configRepo.findById(1L).orElseGet(EngineConfiguration::new);
    }

    @Transactional
    public void applyReputationConfiguration(double floor, double ceiling, double startValue, String tiersJson) {
        EngineConfiguration config = getOrCreateConfig();
        config.setScoreFloor(floor);
        config.setScoreCeiling(ceiling);
        config.setStartValue(startValue);
        config.setTiersJson(tiersJson);
        configRepo.save(config);
        log.info("ReputationConfiguration applied: floor={}, ceiling={}, startValue={}, tiers={}",
                floor, ceiling, startValue, tiersJson);
    }

    public Map<String, Object> getReputationConfiguration() {
        EngineConfiguration config = getOrCreateConfig();
        if (!config.isReputationConfigured()) {
            return Map.of("configured", false, "ledgerOffset", config.getLedgerOffset());
        }
        return Map.of(
            "configured",   true,
            "scoreFloor",   config.getScoreFloor(),
            "scoreCeiling", config.getScoreCeiling(),
            "startValue",   Math.round(config.getStartValue() * 10000.0) / 10000.0,
            "ledgerOffset", config.getLedgerOffset()
        );
    }

    public Map<String, Double> getTiers() {
        String tiersJson = getOrCreateConfig().getTiersJson();
        if (tiersJson == null || tiersJson.isBlank()) return Map.of();
        try {
            return new ObjectMapper().readerForMapOf(Double.class).readValue(tiersJson);
        } catch (Exception e) {
            log.warn("Failed to parse tiersJson: {}", e.getMessage());
            return Map.of();
        }
    }

    @Transactional
    public void reset() {
        subjectRepo.deleteAll();
    }

    // ── Role ──────────────────────────────────────────────────────────────────

    @Transactional
    public void upsertRole(String party, String roleType, String contractId, String configContractId,
                           List<SubjectComponent> components) {

        EngineConfiguration config = getOrCreateConfig();
        Subject s = subjectRepo.findById(party).orElseGet(() -> {
            Subject n = new Subject();
            n.setParty(party);
            n.setOverallScore(normalizeStartValue(config));
            n.setCreatedAt(Instant.now());
            return n;
        });
        s.setRoleType(roleType);
        s.setContractId(contractId);
        s.setConfigContractId(configContractId);
        s.setUpdatedAt(Instant.now());

        components.forEach(incoming -> {
            s.getComponents().stream()
                    .filter(c -> c.getComponentId().equals(incoming.getComponentId()))
                    .findFirst()
                    .ifPresentOrElse(existing -> {
                        existing.setScore(incoming.getScore());
                        existing.setCount(incoming.getCount());
                    }, () -> {
                        incoming.setSubject(s);
                        s.getComponents().add(incoming);
                    });
        });
        recomputeScore(s);
        recomputeTier(s, getTiers());
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

        componentValues.forEach((componentId, optValue) ->
            optValue.ifPresent(value -> {
                SubjectComponent sc = subject.getComponents().stream()
                        .filter(c -> c.getComponentId().equals(componentId))
                        .findFirst()
                        .orElse(null);

                if (sc == null) {
                    log.warn("applyObservation: no component {} found for party {}", componentId, party);
                    return;
                }

                int count = sc.getCount();
                double step = 1.0 / (count + 2);
                double updated = sc.getScore() + step * (value - sc.getScore());
                sc.setScore(Math.round(updated * 100.0) / 100.0);
                sc.setCount(count + 1);
            })
        );

        recomputeScore(subject);
        recomputeTier(subject, getTiers());

        if (subject.getVcTier() != null && subject.getOverallScore() < subject.getVcThreshold() + 0.05) {
            log.info("VC revoked for party {}: vcTier={}, score={}", party, subject.getVcTier(), subject.getOverallScore());
            subject.setVcTier(null);
            subject.setVcThreshold(null);
            subject.setVcIssuedAt(null);
        }

        subjectRepo.save(subject);
    }

    // ── VC ────────────────────────────────────────────────────────────────────

    @Transactional
    public Optional<String> issueMockVc(String party) {
        Subject subject = subjectRepo.findById(party).orElse(null);
        if (subject == null || subject.getTier() == null) return Optional.empty();

        double threshold = getTiers().getOrDefault(subject.getTier(), 0.0);
        subject.setVcTier(subject.getTier());
        subject.setVcThreshold(threshold);
        subject.setVcIssuedAt(Instant.now());
        subjectRepo.save(subject);

        return Optional.of(buildVcString(subject));
    }

    private String buildVcString(Subject s) {
        String header  = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"mock\",\"typ\":\"VC\"}".getBytes());
        String payload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(String.format(
                        "{\"sub\":\"%s\",\"tier\":\"%s\",\"threshold\":%s,\"iat\":\"%s\"}",
                        s.getParty(), s.getVcTier(), s.getVcThreshold(), s.getVcIssuedAt()).getBytes());
        return header + "." + payload + ".mocksig";
    }

    // ── Score & Tier ──────────────────────────────────────────────────────────

    private void recomputeScore(Subject subject) {
        double weightedSum = 0.0;
        double totalWeight = 0.0;

        for (SubjectComponent sc : subject.getComponents()) {
            weightedSum += sc.getWeight() * sc.getScore();
            totalWeight += sc.getWeight();
        }

        double raw = totalWeight > 0 ? weightedSum / totalWeight : 0.0;
        double clamped = Math.max(0.0, Math.min(1.0, raw));
        subject.setOverallScore(Math.round(clamped * 10000.0) / 10000.0);
        subject.setUpdatedAt(Instant.now());
    }

    private void recomputeTier(Subject subject, Map<String, Double> tiers) {
        String bestTier = null;
        double bestThreshold = -1;
        for (Map.Entry<String, Double> entry : tiers.entrySet()) {
            if (subject.getOverallScore() >= entry.getValue() && entry.getValue() > bestThreshold) {
                bestTier = entry.getKey();
                bestThreshold = entry.getValue();
            }
        }
        subject.setTier(bestTier);
    }

    private double normalizeStartValue(EngineConfiguration config) {
        double floor      = config.getScoreFloor()   != null ? config.getScoreFloor()   : 0.0;
        double ceiling    = config.getScoreCeiling() != null ? config.getScoreCeiling() : 100.0;
        double startValue = config.getStartValue()   != null ? config.getStartValue()   : 70.0;
        return ceiling > floor ? (startValue - floor) / (ceiling - floor) : 0.0;
    }

    private double scaleValue(double raw, EngineConfiguration config) {
        double floor   = config.getScoreFloor()   != null ? config.getScoreFloor()   : 0.0;
        double ceiling = config.getScoreCeiling() != null ? config.getScoreCeiling() : 100.0;
        return Math.round((floor + raw * (ceiling - floor)) * 10000.0) / 10000.0;
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    @Transactional
    public void updateRoleContractId(String party, String contractId) {
        subjectRepo.findById(party).ifPresent(s -> {
            s.setContractId(contractId);
            subjectRepo.save(s);
        });
    }

    public Map<String, Double> getSubjectInternalScores(String party) {
        return subjectRepo.findById(party)
                .map(s -> {
                    Map<String, Double> scores = new java.util.HashMap<>();
                    s.getComponents().forEach(c -> scores.put(c.getComponentId(), c.getScore()));
                    return scores;
                })
                .orElse(Map.of());
    }

    public Optional<SubjectDto> getSubject(String party) {
        EngineConfiguration config = getOrCreateConfig();
        return subjectRepo.findById(party).map(s -> toDto(s, config));
    }

    public List<SubjectDto> getRanking() {
        EngineConfiguration config = getOrCreateConfig();
        return subjectRepo.findAll(
                Sort.by(Sort.Direction.DESC, "overallScore").and(Sort.by(Sort.Direction.ASC, "party"))
        ).stream().map(s -> toDto(s, config)).toList();
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
