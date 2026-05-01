package pt.ulisboa.tecnico.reputation.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.ulisboa.tecnico.reputation.entity.Subject;
import pt.ulisboa.tecnico.reputation.entity.SubjectComponent;
import pt.ulisboa.tecnico.reputation.repository.SubjectRepository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ReputationService {

    private static final Logger log = LoggerFactory.getLogger(ReputationService.class);

    private final SubjectRepository subjectRepo;

    public ReputationService(SubjectRepository subjectRepo) {
        this.subjectRepo = subjectRepo;
    }

    @Transactional
    public void reset() {
        subjectRepo.deleteAll();
    }

    // ── Role ──────────────────────────────────────────────────────────────────

    @Transactional
    public void upsertRole(String party, String roleType, String contractId, String configContractId,
                           Map<String, Double> componentWeights) {
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
                        c.setScore(0.0);
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

        componentValues.forEach((componentId, optValue) ->
            optValue.ifPresent(value -> {
                SubjectComponent sc = subject.getComponents().stream()
                        .filter(c -> c.getComponentId().equals(componentId))
                        .findFirst()
                        .orElseGet(() -> {
                            SubjectComponent c = new SubjectComponent();
                            c.setComponentId(componentId);
                            c.setWeight(0.0);
                            c.setScore(0.0);
                            c.setCount(0);
                            c.setSubject(subject);
                            subject.getComponents().add(c);
                            return c;
                        });

                int count = sc.getCount();
                double updated = (sc.getScore() * count + value) / (count + 1);
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

        double score = totalWeight > 0 ? weightedSum / totalWeight : 0.0;
        subject.setOverallScore(Math.round(score * 100.0) / 100.0);
        subject.setUpdatedAt(Instant.now());
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    public Optional<Subject> getSubject(String party) {
        return subjectRepo.findById(party);
    }

    public List<Subject> getRanking(int limit) {
        return subjectRepo.findAll(
                Sort.by(Sort.Direction.DESC, "overallScore").and(Sort.by(Sort.Direction.ASC, "party"))
        ).stream().limit(limit).toList();
    }

    public List<Subject> getAllSubjects() {
        return subjectRepo.findAll(Sort.by(Sort.Direction.ASC, "party"));
    }
}
