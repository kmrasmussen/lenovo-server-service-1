pub fn gymbro_hello(left: u64, right: u64) -> String {
    format!("hey bro, {} plus {} is {}", left, right, left + right)
}

pub fn list_exercises() -> String {
  "the available exercises to do in this app are: barbell curls, leg press, lateral raises, nothing else".to_string()
}
