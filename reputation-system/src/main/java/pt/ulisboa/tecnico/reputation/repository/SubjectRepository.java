package pt.ulisboa.tecnico.reputation.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import pt.ulisboa.tecnico.reputation.entity.Subject;

public interface SubjectRepository extends JpaRepository<Subject, String> {

}
