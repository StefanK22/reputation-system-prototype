package pt.ulisboa.tecnico.reputation.dto;

import java.time.Instant;
import java.util.List;

public record SubjectDto(
    String party,
    String roleType,
    String contractId,
    String configContractId,
    double overallScore,
    Instant createdAt,
    Instant updatedAt,
    List<ComponentDto> components
) {
    public record ComponentDto(
        Long id,
        String componentId,
        double weight,
        double score,
        int count
    ) {}
}
