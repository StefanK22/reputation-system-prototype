package pt.ulisboa.tecnico.reputation.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pt.ulisboa.tecnico.reputation.entity.SystemState;

public interface SystemStateRepository extends JpaRepository<SystemState, Long> {
}
