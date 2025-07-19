# Selecting a Specific GPU for Stem Separation

This document explains how to specify which NVIDIA GPU to use for the stem separation process if you have multiple GPUs installed on your machine.

## 1. Identify the GPU ID

First, you need to identify the index (or ID) of the GPU you want to use. You can do this by running the `nvidia-smi` command in your terminal on the target machine.

```bash
nvidia-smi
```

This command will output a list of all available NVIDIA GPUs and their details, including their index, which is a number starting from `0`.

## 2. Set the `CUDA_VISIBLE_DEVICES` Environment Variable

Once you have the ID of the desired GPU, you can use the `CUDA_VISIBLE_DEVICES` environment variable to make only that GPU visible to the application.

### Temporary (Per-Session) Selection

To select a GPU for a single session, set the variable before running the application's start script. For example, to use the GPU with ID `1`, you would run:

```bash
CUDA_VISIBLE_DEVICES=1 ./start_server.sh
```

The application will now use only the specified GPU for all CUDA-based operations.

### Permanent Selection for this Project

If you want to consistently use the same GPU for this project, you can add the environment variable to the `start_server.sh` script.

1.  Open the `start_server.sh` file in a text editor.
2.  Add the following line at the beginning of the file, replacing `1` with the ID of your desired GPU:

    ```bash
    export CUDA_VISIBLE_DEVICES=1
    ```

3.  Save the file.

Now, every time you run `./start_server.sh`, it will automatically use the GPU you specified.
