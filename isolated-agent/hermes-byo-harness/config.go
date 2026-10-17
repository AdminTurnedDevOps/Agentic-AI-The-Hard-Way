package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	runtimeconfig "github.com/kagent-dev/kagent/go/adk/pkg/config"
	configv1 "github.com/kagent-dev/kagent/go/api/gen/kagent/config/v1"
)

type hermesConfig struct {
	Model struct {
		Default   string `yaml:"default"`
		Provider  string `yaml:"provider"`
		BaseURL   string `yaml:"base_url,omitempty"`
		MaxTokens int    `yaml:"max_tokens"`
	} `yaml:"model"`
	Providers map[string]hermesProvider `yaml:"providers"`
	Agent     struct {
		SystemPrompt string `yaml:"system_prompt,omitempty"`
	} `yaml:"agent"`
	Terminal struct {
		Cwd string `yaml:"cwd"`
	} `yaml:"terminal"`
}

type hermesProvider struct {
	BaseURL string `yaml:"base_url"`
	KeyEnv  string `yaml:"key_env"`
	APIMode string `yaml:"api_mode"`
	Model   string `yaml:"model"`
}

// parseConfig reads the ADKConfig that kagent compiles for every BYO runtime.
func parseConfig(raw []byte) (*configv1.ADKConfig, error) {
	cfg := new(configv1.ADKConfig)
	if err := runtimeconfig.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("decode %s: %w", configEnv, err)
	}
	return cfg, nil
}

func materializeHermesConfig(cfg *configv1.ADKConfig, dataDir, workspace string) error {
	model := cfg.GetAgent().GetModel()
	openai := model.GetOpenai()
	if openai == nil {
		return fmt.Errorf("Hermes BYO runtime currently supports only OpenAI ModelConfig")
	}
	if strings.TrimSpace(model.GetModel()) == "" {
		return fmt.Errorf("OpenAI model name is required")
	}

	var output hermesConfig
	output.Model.Default = model.GetModel()
	output.Model.Provider = "openai"
	output.Model.BaseURL = openai.GetBaseUrl()
	output.Model.MaxTokens = int(openai.GetMaxCompletionTokens())
	if output.Model.MaxTokens == 0 {
		output.Model.MaxTokens = int(openai.GetMaxTokens())
	}
	if output.Model.MaxTokens == 0 {
		output.Model.MaxTokens = 32768
	}
	if output.Model.BaseURL == "" {
		output.Model.BaseURL = "https://api.openai.com/v1"
	}
	output.Providers = map[string]hermesProvider{"openai": {
		BaseURL: output.Model.BaseURL,
		KeyEnv:  "OPENAI_API_KEY",
		APIMode: "chat_completions",
		Model:   output.Model.Default,
	}}
	output.Agent.SystemPrompt = cfg.GetAgent().GetInstruction()
	output.Terminal.Cwd = workspace

	home := filepath.Join(dataDir, "hermes")
	if err := os.MkdirAll(home, 0o700); err != nil {
		return fmt.Errorf("create Hermes home: %w", err)
	}
	if err := os.MkdirAll(workspace, 0o700); err != nil {
		return fmt.Errorf("create Hermes workspace: %w", err)
	}
	contents, err := yaml.Marshal(output)
	if err != nil {
		return fmt.Errorf("marshal Hermes configuration: %w", err)
	}
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), contents, 0o600); err != nil {
		return fmt.Errorf("write Hermes configuration: %w", err)
	}
	return nil
}
