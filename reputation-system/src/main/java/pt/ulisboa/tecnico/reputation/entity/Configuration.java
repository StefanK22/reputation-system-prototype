package pt.ulisboa.tecnico.reputation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Getter
@Setter
public class Configuration {

    @Id
    @GeneratedValue
    private Long id;

    private String configId;

    private int version;

    private Instant activationTime;

    private String contractId;

    @JdbcTypeCode(SqlTypes.JSON)
    private SystemParameters systemParameters;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<ComponentDefinition> components;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<RoleWeights> roleWeights;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<InteractionType> interactionTypes;

    // ── Nested types ──────────────────────────────────────────────────────────

    @Getter
    @Setter
    public static class SystemParameters {
        private double reputationScoreFloor;
        private double reputationScoreCeiling;
    }

    @Getter
    @Setter
    public static class ComponentDefinition {
        private String componentId;
        private String description;
        private double initialValue;
    }

    @Getter
    @Setter
    public static class RoleWeights {
        private String roleId;
        private Map<String, Double> componentWeights;
    }

    @Getter
    @Setter
    public static class RatingRule {
        private String componentId;
        private String conditionField;
        private String conditionComparator;
        private double conditionValue;
        private double ratingValue;
    }

    @Getter
    @Setter
    public static class InteractionType {
        private String interactionTypeId;
        private String description;
        private List<RatingRule> ratingRules;
    }
}
