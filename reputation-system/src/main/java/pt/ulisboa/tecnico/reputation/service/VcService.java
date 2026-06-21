package pt.ulisboa.tecnico.reputation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import pt.ulisboa.tecnico.reputation.dto.VcStatus;
import pt.ulisboa.tecnico.reputation.entity.Subject;
import pt.ulisboa.tecnico.reputation.repository.SubjectRepository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
public class VcService {

    private static final String ISSUER_ID = "https://reputation-system.example/issuer";
    private static final String MOCK_SIGNING_SECRET = "mock-issuer-secret";

    private final SubjectRepository subjectRepo;
    private final ReputationService reputationService;

    public VcService(SubjectRepository subjectRepo, ReputationService reputationService) {
        this.subjectRepo = subjectRepo;
        this.reputationService = reputationService;
    }

    public Optional<String> issueMockVc(String party) {
        Subject subject = subjectRepo.findById(party).orElse(null);
        if (subject == null || subject.getTier() == null) return Optional.empty();

        int interactionCount = subject.getInteractionCount();
        if (interactionCount == 0) return Optional.empty();

        String issuanceDate = Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
        return Optional.of(buildVcString(party, subject.getTier(), issuanceDate, interactionCount));
    }

    /** Explains why issueMockVc returned empty for this party, for surfacing to API callers. */
    public String issuanceBlockReason(String party) {
        Subject subject = subjectRepo.findById(party).orElse(null);
        if (subject == null) return "Unknown party: " + party;
        if (subject.getInteractionCount() == 0) return "Party " + party + " has no recorded interactions yet";
        if (subject.getTier() == null) return "Party " + party + " has not yet qualified for a tier";
        return "Unable to issue VC for party: " + party;
    }

    public VcStatus verifyMockVc(String party, String tier, String issuanceDate, String jws) {
        Subject subject = subjectRepo.findById(party).orElse(null);
        if (subject == null) return VcStatus.INVALID;

        try {
            Map<String, Object> credential = buildCredential(party, tier, issuanceDate, subject.getInteractionCount());
            String expectedJws = mockSign(credential);
            if (!expectedJws.equals(jws)) return VcStatus.INVALID;
        } catch (Exception e) {
            return VcStatus.INVALID;
        }

        // The signature proves the VC was genuinely issued for this tier; this checks it's still current.
        return Objects.equals(tier, subject.getTier()) ? VcStatus.VALID : VcStatus.REVOKED;
    }

    private String reputationRangeLabel(String tier) {
        var config = reputationService.getOrCreateConfig();
        Map<String, Double> tiers = reputationService.getDisplayTiers();
        Double lower = tiers.get(tier);
        if (lower == null) return null;

        double upper = tiers.values().stream()
                .filter(v -> v > lower)
                .min(Double::compareTo)
                .orElse(config.getScoreCeiling());

        return lower + "-" + upper;
    }

    private Map<String, Object> buildCredential(String party, String tier, String issuanceDate, int interactionCount) {
        Map<String, Object> credentialSubject = new LinkedHashMap<>();
        credentialSubject.put("id", party);
        credentialSubject.put("tier", tier);
        credentialSubject.put("reputationRange", reputationRangeLabel(tier));
        credentialSubject.put("interactionCount", interactionCount);

        Map<String, Object> credential = new LinkedHashMap<>();
        credential.put("@context", List.of(
                "https://www.w3.org/2018/credentials/v1",
                "https://www.w3.org/2018/credentials/examples/v1"));
        credential.put("id", "urn:vc:reputation:" + party);
        credential.put("type", List.of("VerifiableCredential", "ReputationCredential"));
        credential.put("issuer", ISSUER_ID);
        credential.put("issuanceDate", issuanceDate);
        credential.put("credentialSubject", credentialSubject);
        return credential;
    }

    private String buildVcString(String party, String tier, String issuanceDate, int interactionCount) {
        try {
            Map<String, Object> credential = buildCredential(party, tier, issuanceDate, interactionCount);

            Map<String, Object> proof = new LinkedHashMap<>();
            proof.put("type", "RsaSignature2018");
            proof.put("created", issuanceDate);
            proof.put("proofPurpose", "assertionMethod");
            proof.put("verificationMethod", ISSUER_ID + "#key-1");
            proof.put("jws", mockSign(credential));

            Map<String, Object> signed = new LinkedHashMap<>(credential);
            signed.put("proof", proof);

            return new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(signed);
        } catch (Exception e) {
            throw new RuntimeException("Failed to build VC", e);
        }
    }

    private String mockSign(Map<String, Object> credential) throws Exception {
        String canonical = new ObjectMapper().writeValueAsString(credential);
        String header = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"mock256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String payload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(canonical.getBytes(StandardCharsets.UTF_8));

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        digest.update((header + "." + payload + "." + MOCK_SIGNING_SECRET).getBytes(StandardCharsets.UTF_8));
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(digest.digest());

        return header + "." + payload + "." + signature;
    }
}
