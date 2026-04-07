package pt.ulisboa.tecnico.reputation.entity;
import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Setter
public class Component {

    @Id
    @GeneratedValue
    private Long id;

    private String componentId;

    private String description;

    private double value;

    private int interactionCount;

    @JsonBackReference
    @ManyToOne
    @JoinColumn(name = "subject_id")
    private Subject subject;
}