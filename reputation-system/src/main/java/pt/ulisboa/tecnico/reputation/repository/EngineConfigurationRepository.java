package pt.ulisboa.tecnico.reputation.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pt.ulisboa.tecnico.reputation.entity.EngineConfiguration;

public interface EngineConfigurationRepository extends JpaRepository<EngineConfiguration, Long> {}
