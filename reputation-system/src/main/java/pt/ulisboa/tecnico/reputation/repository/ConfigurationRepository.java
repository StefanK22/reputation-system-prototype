package pt.ulisboa.tecnico.reputation.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import pt.ulisboa.tecnico.reputation.entity.Configuration;

public interface ConfigurationRepository extends JpaRepository<Configuration, Long> {

}
