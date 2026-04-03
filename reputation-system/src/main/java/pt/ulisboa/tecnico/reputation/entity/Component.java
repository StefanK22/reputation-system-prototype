package pt.ulisboa.tecnico.reputation.entity;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.List;

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

    @ManyToOne
    @JoinColumn(name = "subject_id")
    private Subject subject;
}