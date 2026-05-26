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

    private Long ledgerOffset = 0L;

    private Double scoreFloor;
    private Double scoreCeiling;
    private Double startValue;

    public boolean isReputationConfigured() {
        return scoreFloor != null && scoreCeiling != null && startValue != null;
    }
}
