package pt.ulisboa.tecnico.reputation.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class Subject {

    @Id
    private String party;

    private String roleId;

    private double overallScore;

    private long lastLedgerOffset;

    private String contractId;

    @OneToMany(mappedBy = "subject", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Component> components = new ArrayList<>();

    private Instant createdAt;
    
    private Instant updatedAt;
}