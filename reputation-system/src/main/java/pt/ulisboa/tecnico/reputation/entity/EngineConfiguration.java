package pt.ulisboa.tecnico.reputation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.HashMap;
import java.util.Map;

@Entity
@Getter
@Setter
public class EngineConfiguration {

    @Id
    private Long id = 1L;

    private long ledgerOffset = 0L;

    private Double scoreFloor;
    private Double scoreCeiling;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "engine_configuration_start_values", joinColumns = @JoinColumn(name = "config_id"))
    @MapKeyColumn(name = "component_id")
    @Column(name = "start_value")
    private Map<String, Double> componentStartValues = new HashMap<>();

    public boolean isReputationConfigured() {
        return scoreFloor != null && scoreCeiling != null;
    }
}
