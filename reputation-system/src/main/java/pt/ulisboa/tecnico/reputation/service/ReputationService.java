package pt.ulisboa.tecnico.reputation.service;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.ulisboa.tecnico.reputation.entity.*;
import pt.ulisboa.tecnico.reputation.repository.ConfigurationRepository;
import pt.ulisboa.tecnico.reputation.repository.SubjectRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class ReputationService {

    private final SubjectRepository subjectRepo;
    private final ConfigurationRepository configRepo;

    public ReputationService(SubjectRepository subjectRepo, ConfigurationRepository configRepo) {
        this.subjectRepo = subjectRepo;
        this.configRepo = configRepo;
    }

    // Wipe the read model so the engine can rebuild it cleanly from ledger offset 0.
    @Transactional
    public void reset() {
        subjectRepo.deleteAll();
        configRepo.deleteAll();
    }

    @Transactional
    public Configuration addConfiguration(Configuration config) {
        return configRepo.save(config);
    }

    public Optional<Configuration> getLatestConfig() {
        List<Configuration> configs = configRepo.findAll(
            Sort.by(Sort.Direction.DESC, "version")
        );
        return configs.isEmpty() ? Optional.empty() : Optional.of(configs.get(0));
    }


    @Transactional
    public Subject updateOrCreateNewSubject(String party, String roleId) {
        Subject s = subjectRepo.findById(party).orElseGet(() -> {
            return createSubject(party, roleId);
        });
        s.setRoleId(roleId);
        s.setUpdatedAt(Instant.now());
        return subjectRepo.save(s);
    }

    // Resolve the role for a party. Returns UNKNOWN_ROLE if no subject exists for the party.
    public String getRole(String party) {
        return subjectRepo.findById(party)
            .map(Subject::getRoleId)
            .orElse("UNKNOWN_ROLE");
    }

    public Optional<Subject> getSubject(String party) {
        return subjectRepo.findById(party);
    }

    @Transactional
    public Subject createSubject(String party, String roleId) {
        Subject s = new Subject();
        s.setParty(party);
        s.setRoleId(roleId);
        s.setOverallScore(0);
        s.setCreatedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        return subjectRepo.save(s);
    }

    public Subject getOrCreateSubject(String party, String roleId) {
        return subjectRepo.findById(party)
            .orElseGet(() -> createSubject(party, roleId));
    }

    @Transactional
    public Subject updateSubject(Subject subject) {
        subject.setUpdatedAt(Instant.now());
        return subjectRepo.save(subject);
    }

    public List<Subject> getRanking(int limit) {
        return subjectRepo.findAll(
            Sort.by(Sort.Direction.DESC, "overallScore").and(Sort.by(Sort.Direction.ASC, "party"))
        ).stream().limit(limit).toList();
    }

    public List<Subject> getAllSubjects() {
        return subjectRepo.findAll(Sort.by(Sort.Direction.ASC, "party"));
    }

    public List<Configuration> getAllConfigurations() {
        return configRepo.findAll(Sort.by(Sort.Direction.DESC, "version"));
    }

    // Recomputes overall score as an equal-weight average of all component values,
    // rounded to 2 decimal places.
    public void recomputeScore(Subject subject) {
        List<Component> components = subject.getComponents();
        if (components.isEmpty()) {
            subject.setOverallScore(0);
            subject.setUpdatedAt(Instant.now());
            return;
        }
        double sum = components.stream().mapToDouble(Component::getValue).sum();
        double avg = sum / components.size();
        subject.setOverallScore(Math.round(avg * 100.0) / 100.0);
        subject.setUpdatedAt(Instant.now());
    }
}
