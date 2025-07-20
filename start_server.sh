#!/bin/bash

PORT=${1:-8000}

# Check if nvidia-smi is available
if ! command -v nvidia-smi &> /dev/null
then
    echo "nvidia-smi not found. Running on CPU."
    source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port $PORT
    exit
fi

# Create a list of choices for the user
mapfile -t choices < <(nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits | awk -F, '{print "GPU " $1 ": " $2}')
choices+=("CPU")

# Present the menu to the user
PS3="
Please select a device to run on: "
echo "Available devices:"
select device in "${choices[@]}"; do
    if [[ "$device" == "CPU" ]]; then
        echo "Starting server on CPU..."
        # No need to set CUDA_VISIBLE_DEVICES
        source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port $PORT
        break
    elif [[ -n "$device" ]]; then
        gpu_id=$(echo "$device" | awk '{print $2}' | sed 's/://')
        echo "Starting server on GPU $gpu_id..."
        export CUDA_VISIBLE_DEVICES=$gpu_id
        source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port $PORT
        break
    else
        echo "Invalid selection. Please try again."
    fi
done