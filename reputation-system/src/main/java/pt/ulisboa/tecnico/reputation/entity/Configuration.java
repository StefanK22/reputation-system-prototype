package pt.ulisboa.tecnico.reputation.entity;

import jakarta.persistence.*;
import java.time.Instant;

import lombok.Getter;
import lombok.Setter;

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
}