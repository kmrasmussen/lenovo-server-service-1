#[derive(serde::Deserialize, Debug)]
pub struct WhisperUsage {
    pub r#type: String, // 'type' is a keyword in Rust, so we use r# to escape it
    pub seconds: u32,
}

#[derive(serde::Deserialize, Debug)]
pub struct WhisperTranscriptionResponse {
    pub text: String,
    pub usage: WhisperUsage,
}
