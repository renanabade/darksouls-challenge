package com.renanabade.darksouls.server.config;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import tools.jackson.databind.json.JsonMapper;

/** The API's errors: validation problems list what is wrong by field, and a conflict or a miss says it in one JSON string. */
@RestControllerAdvice
public class ApiErrors {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    /** A validation problem, as RFC 9457 problem details with the errors by field. */
    public record ValidationProblem(String type, String title, int status, Map<String, List<String>> errors) {}

    public static ResponseEntity<Object> validation(String key, String message) {
        return validation(Map.of(key, List.of(message)));
    }

    public static ResponseEntity<Object> validation(Map<String, List<String>> errors) {
        var problem = new ValidationProblem(
                "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                "One or more validation errors occurred.",
                HttpStatus.BAD_REQUEST.value(),
                new LinkedHashMap<>(errors));
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    /** A status with a message for the player, as a JSON string. */
    public static ResponseEntity<Object> message(HttpStatus status, String message) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(MAPPER.writeValueAsString(message));
    }

    // A path that is not an id names nothing.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<Void> notAnId(MethodArgumentTypeMismatchException error) {
        return ResponseEntity.notFound().build();
    }
}
