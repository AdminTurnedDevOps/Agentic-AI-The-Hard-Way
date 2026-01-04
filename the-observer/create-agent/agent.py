from crewai import Agent, Task, Crew, Process, LLM
from crewai.mcp import MCPServerStdio
from crewai.mcp.filters import create_static_tool_filter
import os

def main():
    # Set dummy OpenAI API key for Ollama compatibility
    # CrewAI's LLM class internally uses OpenAI-compatible clients that validate the API key presence
    os.environ['OPENAI_API_KEY'] = 'ollama'

    modelType = LLM(model="ollama/deepseek-r1:8b", temperature=0.1, base_url="http://localhost:11434")


    search = Agent(
        role="Observability Expert",
        goal="""
        Monitor and analyze Kubernetes cluster health by examining pod status, resource utilization, and namespace organization.
        Identify pods with issues (CrashLoopBackOff, Pending, Failed states), detect resource constraints, and provide
        actionable insights about cluster stability and performance. Present findings in a clear, prioritized format.
        """,
        backstory="An expert in k8s observability",
        llm=modelType,
        mcps=[
            MCPServerStdio(
                command="npx",
                args=["-y", "kubernetes-mcp-server@latest"],
                tool_filter=create_static_tool_filter(
                    allowed_tool_names=["pods_list", "pods_get", "namespaces_list"]
                ),
                cache_tools_list=True,
            ),
       ]
    )

    job = Task(
        description="Kubernetes expert helping us solve issues in a Kubernetes cluster",
        expected_output="Fixes for whatever is found in logs, traces, metrics, and any other observability data",
        agent=search
    )

    crew = Crew(
        agents=[search],
        tasks=[job],
        verbose=True,
        process=Process.sequential,
    )
    
    crew.kickoff()

    
if __name__ == '__main__':
    main()