package pt.ulisboa.tecnico.reputation.entity;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Setter
public class Subject {

    @Id
    private String party;

    private String roleType;

    private String contractId;
    private String configContractId;

    private double overallScore;

    @JsonManagedReference
    @OneToMany(mappedBy = "subject", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SubjectComponent> components = new ArrayList<>();

    private Instant createdAt;
    private Instant updatedAt;
}
