FROM python:3.13.7-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ateapi_subset.proto .
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. ateapi_subset.proto
COPY server.py test_server.py .
USER 65532:65532
EXPOSE 8080
CMD ["python", "server.py"]
