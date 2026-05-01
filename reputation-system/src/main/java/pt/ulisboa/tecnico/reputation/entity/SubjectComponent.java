package pt.ulisboa.tecnico.reputation.entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"party", "component_id"}))
@Getter
@Setter
public class SubjectComponent {

    @Id
    @GeneratedValue
    private Long id;

    private String componentId;
    private double weight;
    private double score;
    private int count;

    @JsonBackReference
    @ManyToOne
    @JoinColumn(name = "party")
    private Subject subject;
}
