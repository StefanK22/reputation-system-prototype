package pt.ulisboa.tecnico.reputation.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class SystemState {

    @Id
    private Long id = 1L;

    private long ledgerOffset;
}
